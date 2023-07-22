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
app.post('/matchPool', async (req, res) => {
    admin.auth().verifyIdToken(req.body.token).then(async (decodedToken) => {
        const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
                await client.connect();
                try {
                    const collection = client.db("ropedin-mobile").collection("matchPreferences")
                    let matchPreferences = await db.collection('matchPreferences').doc(req.body.uid).get()
                    matchPreferences = matchPreferences.data()
                    const query = {
                        profileInvisible: { $eq: false },
                        $and: [{ age: { $gte: matchPreferences.agesSelected.min } }, { age: { $lte: matchPreferences.agesSelected.max } }]
                    }
                    const orTypeQuery = { $or: [] }
                    const orLevelQuery = { $or: [] }
                    const orDaysQuery = { $or: [] }
                    //only add to query if user wants one gender
                    if (matchPreferences.partner.length == 1) {
                        query.sex = { $eq: matchPreferences.partner[0] }
                    }
                    matchPreferences.level.forEach((level) => {
                        orLevelQuery.$or.push({ level: level })
                    })
                    matchPreferences.climbingType.forEach((type) => {
                        orTypeQuery.$or.push({ climbingType: type })
                    })
                    matchPreferences.daysSelected.forEach((day) => {
                        orDaysQuery.$or.push({ daysSelected: day })
                    })
                    if (orLevelQuery.length) {
                        query.$and.push(orLevelQuery)
                    }
                    if (orTypeQuery.length) {
                        query.$and.push(orTypeQuery)
                    }
                    if (orDaysQuery.length) {
                        query.$and.push(orDaysQuery)
                    }
                    let uids = []
                    let rejectedUsersList = await db.collection('rejects').doc(req.body.uid).get()
                    if (typeof rejectedUsersList.data() !== 'undefined' && rejectedUsersList.data().rejectUIDs) {
                        rejectedUsersList.data().rejectUIDs.forEach((uid) => { uids.push(uid) })
                    }
                    let blockedUsers = await db.collection('blockedLists').doc(req.body.uid).get()
                    if (typeof blockedUsers.data() !== 'undefined' && blockedUsers.data().blockedUIDs) {
                        blockedUsers.data().blockedUIDs.forEach((uid) => uids.push(uid))
                    }
                    let alreadyMatchedUsers = await db.collection('matches').doc(req.body.uid).get()
                    if (alreadyMatchedUsers.data().matchUIDs) {
                        alreadyMatchedUsers.data().matchUIDs.forEach((uid) => uids.push(uid))
                    }
                    let alreadySwipedUsers = await db.collection('users').doc(req.body.uid).collection('matchPool').doc('potentialMatches').get()
                    if (typeof alreadySwipedUsers.data() !== 'undefined' && alreadySwipedUsers.data().matchUIDs) {
                        alreadySwipedUsers.data().matchUIDs.forEach((uid) => uids.push(uid))
                    }
                    uids.push(req.body.uid)
                    query.$and.push({ uid: { $nin: uids } })
                    // limit query results for scalability
                    cursor = collection.find(query)
                    let matchUIDs = []
                    await cursor.forEach(function (cursorItem) {
                        matchUIDs.push(cursorItem.uid);
                    });
                    // while (await cursor.hasNext()) {

                    //   doc = await cursor.next()

                    //   matchUIDs.push(doc.uid)

                    // }
                    cursor.close()
                    miles = 60
                    meters = miles * 1609.34
                    radius = meters
                    const geoQuery = {
                        "location": {
                            $near: {
                                $geometry: {
                                    type: "Point",
                                    coordinates: [req.body.location.longitude, req.body.location.latitude]
                                }, $maxDistance: radius
                            }
                        },
                        uid: { $in: matchUIDs }
                    }
                    const geoCollection = client.db("ropedin-mobile").collection("geoDocuments")
                    geoCursor = geoCollection.find(geoQuery).limit(50)
                    let newMatchUIDs = []
                    await geoCursor.forEach(function (cursorItem) {
                        newMatchUIDs.push(cursorItem.uid);
                    });
                    // while (await geoCursor.hasNext()) {

                    //   doc = await geoCursor.next()

                    //   newMatchUIDs.push(doc.uid)

                    // }
                    geoCursor.close()
                    const matchPool = []
                    await Promise.all(newMatchUIDs.map(async (matchUID) => {
                        let matchProfile = await db.collection('users').doc(matchUID).get()
                        if (matchProfile.data()) {
                            matchProfile = matchProfile.data().profile
                            matchPool.push(matchProfile)
                        }
                    }))
                    //only cache match pool if it has potential matches in it
                    if (matchPool.length) {
                        //cache matchPool in DB; don't run this function fully until match pool exhausted or expired; store in separate collection/doc so that the data don't get tacked onto any profile data retrievals
                        await db.collection('users').doc(req.body.uid).collection('matchPool').doc('cachedPool').set({ createdAt: new Date(), matchPoolUIDs: newMatchUIDs })
                    }
                    res.status = 200
                    res.send({ matchPool: matchPool })
                    client.close()
                }
                catch (err) {
                    console.log("Match pool error: " + err)
                    res.status = 500
                    res.send([])
                    client.close()
                }
    }).catch((err) => {
        console.log("Match pool error: " + err)
        res.status = 403
        res.send([])
        client.close()
    })
})
app.post('/matchPreferences', async (req, res) => {

    admin.auth().verifyIdToken(req.body.token).then(async (decodedToken) => {
  
      const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
      await client.connect();
    //   client.connect(async err => {
  
    //     if (err) {
    //       res.sendStatus(500)
    //       return
    //     }
  
        const collection = client.db("ropedin-mobile").collection("matchPreferences")
  
        collection.updateOne({ uid: decodedToken.uid }, { $set: req.body }, (err, res) => {
  
          client.close()
  
        })
  
        res.sendStatus(200)
  
      })
    // })
    //   .catch((err) => {
    //     console.log("Error updating match preferences: " + err)
    //     res.sendStatus(403)
    //   })
  })
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