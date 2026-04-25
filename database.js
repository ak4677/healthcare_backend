// require('dotenv').config();
const mangoose=require('mongoose')
const dataurl=process.env.MONGO_URI;
let isConnected = false;

const connectomango = async () => {
    if (isConnected) {
        // already connected → reuse
        return;
    }

    try {
        const db = await mangoose.connect(dataurl, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        isConnected = db.connections[0].readyState === 1;

        console.log("Connected to MongoDB");
    } catch (err) {
        console.error("Connection error:", err.message);
        throw err;
    }
};
module.exports=connectomango;