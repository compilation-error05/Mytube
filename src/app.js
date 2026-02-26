import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"

const app=express()

app.use(cors({
    origin: process.env.CORS_ORIGIN/* from where and which 
    ports/urls i will allow as corss origin , 
     not all the websites and anyone can 
     access my backend only a few can so i 
     nned to configure them*/
}))
app.use(express.json())
app.use(express.urlencoded())
app.use(express.static("public"))
app.use(cookieParser())
import userRouter from './routes/user.routes.js'
app.use("/api/v1/user",userRouter)
export{app}
