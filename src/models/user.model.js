import mongoose,{Schema} from "mongoose";
import {JsonWebTokenError} from "jsonwebtoken";
import bcrypt from "bcrypt";
import 
const userSchema=new Schema(
    {
        username:{
            type:String,
            required:true,
            unique: true,
            lowercase:true,
            trim:true,
            index:true
        },
        email:{
            type:String,
            required:true,
            unique: true,
            lowercase:true,
            trim:true,
        },
        fullname:{
            type:String,
            required:true,
            trim:true,
            index:true
        },
        avatrar:{
            type: String,//it is going to use a cloudanaity url,
            required: true,
        },
        coverimage:{
            type: String,//it is going to use a cloudanaity url,
        },
        watchHistory:[
            {
                type:Schema.Types.ObjectId,
                ref:"Video"
            }
        ],
        password:{
            type:String,
            required:[true,'Password is required']
        },
        refreshToken:{
            type:String
        }
    },
    {
        timestamps:true
    }
)
export const User=mongoose.model("User",userSchema)
userSchema.pre("save",async function(next) {
    if(!this.isModified("password"))return next();
    this.password=bcrypt.hash(this.password,10)
    next()
})
userSchema.methods.isPasswordCorrect=async function(password){
    return await bcrypt.compare(password,this.password)
}
userSchema.methods.generateAccessToken=function(){
    JsonWebTokenError.sign(
        {
            _id:this._id,
            email:this.email,
            username:this.username,
            fullName:this.fullname
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn:process.env.ACCESS_TOKEN_EXPIRY
        }
    )
}
userSchema.methods.generateAccessToken=function(){
    JsonWebTokenError.sign(
        {
            _id:this._id,
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn:process.env.REFRESH_TOKEN_EXPIRY
        }
    )
}