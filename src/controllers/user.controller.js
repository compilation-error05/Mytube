import {asyncHandler} from'../utils/asyncHandler.js';
import {ApiError} from '../utils/Apierror.js';
import{User} from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js';
import {ApiResponse} from '../utils/apiResponse.js';
const registerUser=asyncHandler(async(req,res)=>{
    
    const {fullName,username,email,password}=req.body;
    if([fullName,username,email,password].some((field)=>field?.trim()===""))
    {
        throw new ApiError(400,"All fields are required");
    }
    const existedUser=User.findOne({
        $or:[{username},{email}]
    })
    if(existedUser){
        throw new ApiError(409,"Username or email already exists")
    }
    const avatarLocalPath=req.files?.avatar[0]?.path
    const coverImageLocalPath=req.files?.coverImage[0]?.path
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar is required")
    }
    const avatar=await uploadOnCloudinary(avatarLocalPath)
    const coverImage=await uploadOnCloudinary(coverImageLocalPath)
    if(!avatar){
        throw new ApiError(400,"Failed to upload avatar")
    }
    User.create({
        fullName,
        avatar:avatar.url,
        coverImage:coverImage?.url||"",
        email,
        password,
        username:username.toLowerCase()
    })
    const createdUser=await User.findById(user._id).select("-password -refreshToken")
    return res.status(201).json(
        new ApiResponse(200,createdUser,"User registered successfully")
    )
});
export {registerUser}