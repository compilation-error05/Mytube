import { asyncHandler } from '../utils/asyncHandler.js'; // wrapper to handle async errors
import { ApiError } from '../utils/Apierror.js'; // custom error class
import { User } from '../models/user.model.js'; // user model
import { uploadOnCloudinary } from '../utils/cloudinary.js'; // upload helper
import { ApiResponse } from '../utils/apiResponse.js'; // standard response format
import jwt from 'jsonwebtoken'; // jwt library
import mongoose from 'mongoose';

// generate access + refresh tokens
const generateAccessandRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId); // find user by id

        const accessToken = user.generateAccessToken(); // create access token
        const refreshToken = user.generateRefreshToken(); // create refresh token

        user.refreshToken = refreshToken; // store refresh token in db
        await user.save({ validateBeforeSave: false }); // save without validation

        return { accessToken, refreshToken }; // return tokens
    } catch (error) {
        throw new ApiError(500, "Error generating tokens"); // throw error if fails
    }
};

// register user
const registerUser = asyncHandler(async (req, res) => {
    const { fullName, userName, email, password } = req.body; // get user data

    if ([fullName, userName, email, password].some(f => f?.trim() === "")) { // check empty fields
        throw new ApiError(400, "All fields are required");
    }

    const existedUser = await User.findOne({ // check if user exists
        $or: [{ userName }, { email }]
    });

    if (existedUser) {
        throw new ApiError(409, "Username or email already exists"); // conflict error
    }

    const avatarLocalPath = req.files?.avatar?.[0]?.path; // get avatar file path
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path; // get cover path

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar is required"); // avatar mandatory
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath); // upload avatar
    const coverImage = coverImageLocalPath
        ? await uploadOnCloudinary(coverImageLocalPath) // upload cover if exists
        : null;

    if (!avatar) {
        throw new ApiError(400, "Avatar upload failed"); // check upload success
    }

    const user = await User.create({ // create user in db
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        userName: userName.toLowerCase() // normalize username
    });

    const createdUser = await User.findById(user._id).select("-password -refreshToken"); // remove sensitive fields

    return res.status(201).json(
        new ApiResponse(201, createdUser, "User registered successfully") // send response
    );
});

// login user
const loginUser = asyncHandler(async (req, res) => {
    const { email, userName, password } = req.body; // get login data

    if (!password || (!email && !userName)) { // require password and either email or username
        throw new ApiError(400, "Email/Username and password required");
    }

    const user = await User.findOne({ // find user
        $or: [{ email }, { userName }]
    });

    if (!user) throw new ApiError(404, "User not found"); // user not found

    const isPasswordValid = await user.isPasswordCorrect(password); // check password
    if (!isPasswordValid) throw new ApiError(401, "Invalid password");

    const { accessToken, refreshToken } = await generateAccessandRefreshToken(user._id); // generate tokens

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken"); // hide sensitive data

    const options = {
        httpOnly: true, // prevent js access
        secure: true // only https
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options) // set access token cookie
        .cookie("refreshToken", refreshToken, options) // set refresh token cookie
        .json(new ApiResponse(200, {
            user: loggedInUser,
            accessToken,
            refreshToken
        }, "Login successful")); // send response
});

// logout user
const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { // clear refresh token in db
        $set: { refreshToken: null }
    });

    const options = {
        httpOnly: true,
        secure: true
    };

    return res
        .status(200)
        .clearCookie("accessToken", options) // clear access token cookie
        .clearCookie("refreshToken", options) // clear refresh token cookie
        .json(new ApiResponse(200, {}, "Logged out successfully"));
});

// refresh token
const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies?.refreshToken || req.body.refreshToken; // get token from cookie or body

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request"); // no token
    }

    const decoded = jwt.verify( // verify refresh token
        incomingRefreshToken,
        process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decoded._id); // find user
    if (!user) throw new ApiError(401, "Invalid refresh token");

    if (incomingRefreshToken !== user.refreshToken) { // check token match
        throw new ApiError(401, "Token expired or reused");
    }

    const { accessToken, refreshToken } =
        await generateAccessandRefreshToken(user._id); // generate new tokens

    const options = {
        httpOnly: true,
        secure: true
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options) // set new access token
        .cookie("refreshToken", refreshToken, options) // set new refresh token
        .json(new ApiResponse(200, {
            accessToken,
            refreshToken
        }, "Token refreshed"));
});

// change password
const changeCurrentPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body; // get passwords

    const user = await User.findById(req.user._id); // get current user

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword); // verify old password
    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid old password");
    }

    user.password = newPassword; // set new password
    await user.save(); // save user

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
});

// get current user
const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "Current user fetched")); // return logged in user
});

// update account details
const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body; // get new data

    if (!fullName || !email) {
        throw new ApiError(400, "All fields required"); // validation
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { fullName, email } }, // update fields
        { new: true }
    ).select("-password"); // exclude password

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Account updated"));
});

// update avatar
const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path; // get file path

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file missing");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath); // upload avatar

    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { avatar: avatar.url } }, // update avatar
        { new: true }
    ).select("-password");

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Avatar updated"));
});

// update cover image
const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverLocalPath = req.file?.path; // get cover file

    if (!coverLocalPath) {
        throw new ApiError(400, "Cover file missing");
    }

    const cover = await uploadOnCloudinary(coverLocalPath); // upload cover

    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { coverImage: cover.url } }, // update cover
        { new: true }
    ).select("-password");

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Cover updated"));
});

// GET USER CHANNEL PROFILE
const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params; // extract username from URL params

    if (!username?.trim()) {
        throw new ApiError(400, "username is missing"); // validation check
    }

    const channel = await User.aggregate([
        {
            // match user by username (case insensitive)
            $match: {
                userName: username.toLowerCase() 
            }
        },
        {
            // fetch subscribers of this channel
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            // fetch channels this user subscribed to
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            // compute additional fields
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers" // total subscribers count
                },
                channelSubscribedToCount: {
                    $size: "$subscribedTo" // total subscriptions count
                },
                isSubscribed: {
                    // check if current logged-in user is subscribed
                    $cond: {
                        if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                        then: true,
                        else: false
                    }
                },
            }
        },
        {
            // select only required fields
            $project: {
                fullName: 1,
                userName: 1,
                subscribersCount: 1,
                channelSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ]);

    if (!channel?.length) {
        throw new ApiError(404, "channel does not exists");
    }

    return res.status(200).json(
        new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

// GET WATCH HISTORY
const getWatchHistory = asyncHandler(async (req, res) => {
    const user = await User.aggregate([
        {
            // match current logged-in user by ID
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            // fetch user's watched videos
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        // fetch owner details of each video
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    // project only necessary owner fields
                                    $project: {
                                        fullName: 1,
                                        userName: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        // flatten owner array -> single object
                        $addFields: {
                            owner: { $first: "$owner" }
                        }
                    }
                ]
            }
        }
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "Watch history fetched successfully"
        )
    );
});

// exports
export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
};