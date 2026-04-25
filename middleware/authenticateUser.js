const jwt = require('jsonwebtoken')
const secret_signature = process.env.DOCTOR_SECRET_SIGNATURE


// const doctormid=(req,res,next)=>{
//     const token=req.header('auth-token')
//     if(!token){
//         res.status(401).send("authenticate please")
//     }
//     try {
//         const verify=jwt.verify(token,secret_signature)
//         req.doctor = verify.doctor
//         next()
//     } catch (error) {
//         res.status(401).send("token sahi kar le bhai")
//     }   
// }

const authenticateUser = (req, res, next) => {
  const token = req.header("auth-token")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Access denied" });

  try {
    const decoded = jwt.verify(token, secret_signature);
    // console.log("Decoded JWT:", decoded);
    req.user = decoded; // { id, role }
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired" });
    }

    res.status(401).json({ error: "Invalid token" });
  }
};

// module.exports=doctormid;
module.exports=authenticateUser;