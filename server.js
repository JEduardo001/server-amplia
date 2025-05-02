const express = require('express');
const { bucket ,db, auth} = require('./firebase'); 
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.json()); 

app.post("/updateDataProfileNoImage/:uid", (req,res) => {
  try{
    const uid = req.params.uid
    const name = req.params.name
    const email = req.params.email
    const phone = req.params.phone
    const lastImageByUrl = req.params.lastImageByUrl


    auth.updateUser(uid,{
      email: email,
      displayName: name,
      phoneNumber: phone,
      urlImage: "null"
    })
    deleteImageFromStorage(lastImageByUrl)
    res.status(200).json({
      updateData: true,
      message: "Información actualizada"
    })
  }catch(error){
    console.log("Error al actualizar el usuario sin imagen ",error)
    res.status(200).json({
      updateData: false,
      message: "error al actualizar el usuario sin imagen Error ",error
    })
  }
})
app.post('/updateDataProfileWithImage/:uid', (req, res) => {
  let rawData = [];
  const uid = req.params.uid

  // Recibir los datos binarios del cuerpo
  req.on('data', (chunk) => {
    rawData.push(chunk);
  });

  req.on('end', async () => {
    const buffer = Buffer.concat(rawData);

    if (buffer.length === 0) {
      console.error('No se recibió ningúna imagen.');
      
    }

    let payload;
    try {
      payload = JSON.parse(req.headers['x-payload']);
    } catch (error) {
      console.error('Error al leer los encabezados:', error);
      return res.json({
        updateData: false,
        message: "Metadatos no válidos",
        status: 500,
      })
    }

    const { name, email, phone, fileName, lastImageByUrl } = payload;
    deleteImageFromStorage(lastImageByUrl)

    // Guardar el archivo localmente
    const localFilePath = path.join(__dirname, 'uploads', fileName);
    fs.writeFileSync(localFilePath, buffer);
    console.log('Archivo guardado localmente con tamaño:', fs.statSync(localFilePath).size);

    // Subir el archivo a Firebase
    const blob = bucket.file(fileName);
    const blobStream = blob.createWriteStream();

    blobStream.on('error', (err) => {
      console.error('Error al guardar el archivo en storage:', err);
      fs.unlinkSync(localFilePath); // Eliminar archivo local en caso de error
      return res.json({
        updateData: false,
        message: "Error al guardar el archivo",
        status: 500,
      })
    });

    blobStream.on('finish', async () => {
      try {
        await blob.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        
        // Eliminar el archivo local después de subirlo con éxito
        fs.unlinkSync(localFilePath);
        
        //actualizamos la demas informacion del usuario
        
        auth.updateUser(uid, {
          email: email,
          displayName: name,
          phoneNumber: phone,
          photoURL: publicUrl
        })
  
        res.json({
          updateData: true,
          photoUrl: publicUrl,
          message: "Información actualizada",
          status: 200,
        })
      } catch (error) {
        fs.unlinkSync(localFilePath);
        console.log("Error: ",error)
        const messageError = validateTypeError(error)

        res.json(
          {
            updateData: false,
            message: messageError,
            status: 500,
          }
        )
      }
    });

    blobStream.end(buffer); 
  });

  req.on('error', (err) => {
    console.error('Error al recibir los datos:', err);
    res.status(500).send('Error al procesar los datos.');
  });
});

const deleteImageFromStorage = async (urlImage) => {
  try {
    console.log("urlImage ",urlImage)
    const bucketPath = decodeURIComponent(urlImage.split("/o/")[1].split("?")[0]);

    const file = bucket.file(bucketPath)
    await file.delete()

    console.log(`Archivo eliminado correctamente: ${fileName}`);
   
  } catch (error) {
    console.error("Error al eliminar la imagen:", error.message);
   
  }
}



app.get('/getProducts', async (req,res) => {
  const productsRef = db.collection("products");

  try {
    const productsSnapshot = await productsRef.get();
    const data = productsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));  // Convierte los documentos a un array

    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Error fetching products', error });
  }
})




app.post('/verifyToken', async (req, res) => {
  const idToken = req.body.token;

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    
    res.status(200).send({
      message: 'Token verificado',
      decodedToken,
    });
  } catch (error) {
    res.status(401).send({
      message: 'Token no válido o expirado',
      error: error.message,
    });
  }
});

app.get('/getDataUserToProduct/:uid', async (req,res) => {
  const uid = req.params.uid
  try{
    const userRecord = await auth.getUser(uid);
    res.json({
      existUser: true,
      email: userRecord.email,
      urlImage: userRecord.photoURL,
      nameUser: userRecord.displayName,
      phone: userRecord.phoneNumber,
      message: "Datos del usuario encontrados"
    })

  }catch(error){
    console.log("Error al traer la informacion del usuario para el producto. Error: ",error)
    res.json({
      message: "Error : "+error,
      existUser: false
    })
  }
})

app.post('/createProduct',async(req,res) => {
  const dataProduct = req.body
  try{
   
    const productsRef = db.collection("products");
    const responseCreateProduct = await productsRef.add({
      uidUser: dataProduct.uidUser,
      urlImages: [
        {
          dateUploaded: dataProduct.createdDate,
          id: "null",
          urlImage: "null"
        }
      ],
      id: "null",
      createdDate: dataProduct.createdDate,
      dataCategory: dataProduct.category,
      model: dataProduct.model,
      description: dataProduct.description,
      title: dataProduct.title,
      year: dataProduct.year,
      priceForDay: dataProduct.priceForDay

    })
    await responseCreateProduct.update({id: responseCreateProduct.id})

    //anadimos el producto a la lista de publicaciones del usuario
    const userRef = await db.collection("users").doc(dataProduct.uidUser)
    await userRef.update({
      publications: admin.firestore.FieldValue.arrayUnion({
        idProduct: responseCreateProduct.id,
      }), 
    })
    res.json(
      {
        createProduct: true,
        code: 200,
        message: "Producto creado exitosamente",
      }
    )
  }catch(error) {
    console.log("Error al crear el producto Error: ",error)
    res.json(
      {
        createProduct: false,
        code: 200,
        message: "Error al crear el producto Error : ",error,
      }
    )
  }
})



app.post('/login', async (req,res) => { 
  try {
    const {email} = req.body
    const userRecord = await auth.getUserByEmail(email);
    const customToken = await auth.createCustomToken(userRecord.uid);

    //console.log('Datos del usuario:', userRecord);
    //console.log("token : ",customToken)
    res.json({
      customToken: customToken,
      userExist: true,
      uidUser: userRecord.uid,
      email: userRecord.email,
      emailVerify: userRecord.emailVerified,
      phoneNumber: userRecord.phoneNumber,
      urlImage: userRecord.photoURL,
      nameUser: userRecord.displayName,
      status: 200
    })
  } catch (error) {
    var errorMessage
    console.error('Error al obtener el usuario por correo electrónico:', error);

    switch(error.errorInfo.code){
      case 'auth/user-not-found':
         errorMessage = "No se encontro la cuenta, verifica los datos"
      break
      default:
        errorMessage = "Error desconocido, intenta más tarde"
      break 
    }
    res.json({
      message: errorMessage,
      userExist: false,
      status: 200
    })
    //throw new Error('Usuario no encontrado');
  }

})



app.get("/getPublications/:uid", async(req,res) => {
  const uid = req.params.uid
  try{
    const response = await db.collection('users').doc(uid).get()
    var listPublications = response.data().publications
    for(var publication of listPublications){

      const dataPublication = (await db.collection('products').doc(publication.idProduct).get()).data()
      publication.dataCategory = dataPublication.dataCategory,
      publication.title = dataPublication.title,
      publication.model = dataPublication.model,
      publication.priceForDay =dataPublication.priceForDay,
      publication.year = dataPublication.year,
      publication.description = dataPublication.description,
      publication.urlImages = dataPublication.urlImages
    }
    res.status(200).json(
      {
        error: false,
        code: 200,
        message: "Datos obtenidos",
        data: listPublications,
      }
    )
  }catch(error){
    console.log("Error al obtener las publicaciones Error: ",error)
    res.json({
      error: true,
      code: 200,
      message: "Error : ",error,
    })
  }
})

app.post('/createUser', async (req,res) => {
  try{
   const data = req.body
   const {email,password,name,phone} = data
   //creamos el usuario en el servicio authentication
   const userRecord = await auth.createUser(
      {
        email: email,
        emailVerified: false,
        password: password,
        displayName: name,
        disabled: false,
        phoneNumber: phone
      }
    )

    //creamos la coleccion del usuario con sus demas datos
    const usersRef = db.collection("users").doc(userRecord.uid)
    await usersRef.set({
      publications: [],
      productsIamRenting: []
    })
    
    res.json(
      {
        status: 200,
        message: "Usuario creado exitosamente",
        data: userRecord,
        userCreated: true
      }
    )
   
  }catch(error) {
    var messageError = validateTypeError(error)
    console.error('Error al crear el usuario', messageError);

    res.json(
      {
        userCreated: false,
        message: messageError,
        status: 200,
      }
    )
  }
 
})

const validateTypeError = (error) => {

  switch(error.errorInfo.code){
    case "auth/invalid-password":
       return "La contraseña debe tener al menos 6 caracteres"
    
    case "auth/email-already-exists":
      return  "El correo electronico ingresado ya esta registrado"
    
    case "auth/invalid-email":
      return "El correo electronico ingresado no es correcto"
    
    case "auth/invalid-phone-number":
      return "El numero de teléfono debe iniciar con la clave de tu país. ejemplo en méxico: +52 ... EEUU: +1 ..."
    
    default: 
      return "Error desconocido, intenta más tarde"
  }
}

app.post('/getLinkEmailVerification/:emailUser', async (req,res) => {
  const emailUser = req.params.emailUser

  try {
    // Genera el enlace de verificación
    const link = await auth.generateEmailVerificationLink(emailUser);
    console.log('Enlace de verificación generado:', link);

    res.json({
      generateLink: true,
      message: "Link generado correctamente", 
      data: {linkEmailVerification: link},
      status: 200
    })

  } catch (error) {
    console.error('Error al generar o enviar el enlace de verificación:', error);
    res.json({
      generateLink: false,
      message: error.errorInfo.code, 
      status: 200
    })
  }
})



app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
