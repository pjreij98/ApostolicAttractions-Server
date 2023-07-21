const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express')
var admin = require('firebase-admin')
var timeout = require('connect-timeout')

const cors = require("cors")

require('dotenv').config()

var port = process.env.PORT || 8080

const uri = "mongodb+srv://pjreij98:ct23krWn2OoUccoZ@apostolicattractions.yszzhr6.mongodb.net/ApostolicAttractions?retryWrites=true&w=majority";

//use if path to account key json isn't saved in environment variables: avoid for production 
var serviceAccount = require("./apostolic-attractions-firebase-adminsdk-menbd-94b079d8ea.json")

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const app = express()

app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', `*`)
    res.header('Access-Control-Allow-Methods', 'GET, POST')
    next()
})

app.use(timeout(120000))
app.use(haltOnTimedout)
app.use(express.json())
app.use(haltOnTimedout)
app.use(express.urlencoded({ extended: true }))
app.use(haltOnTimedout)
app.use(cors({ origin: true }));
app.use(haltOnTimedout)

function haltOnTimedout(req, res, next) {
    if (!req.timedout) next()
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
    useNewUrlParser: true,
    useUnifiedTopology: true
});

app.post('/createUser', async (req, res) => {
    try {
        admin.auth().verifyIdToken(req.body.token).then(async (decodedToken) => {

            console.log("before connect")


            console.log("hello")

            // Connect the client to the server	(optional starting in v4.7)
            await client.connect();

            let collection = client.db("ApostolicAttractions").collection("geoDocuments")

            const result = await collection.insertOne({ uid: req.body.uid })

            console.log(`A document was inserted with the _id: ${result.insertedId}`);

            collection = client.db("ApostolicAttractions").collection("matchPreferences")

            collection.insertOne({ uid: req.body.uid, })
            collection.updateOne({ uid: req.body.uid }, { $set: req.body.params }, (err, res) => {
                client.close()
            })
            res.sendStatus(200)
        })
            .catch(err => {
                console.log("Error creating user: " + err)
                res.sendStatus(403)
            })
    } finally {
        await client.close()
    }

    
})

app.listen(port, async () => {
    console.log("listening on port " + port)
})