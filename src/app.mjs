import express from 'express'
import categoryRoutes from './routes/categoryRoutes.mjs'
import productRoutes from './routes/productRoutes.mjs'
import userRoutes from './routes/userRoutes.mjs'
import * as jwt from './middlewares/authUsers.mjs'

const app = express()
app.use(express.json())

app.use('/api/category', jwt.authUsers, categoryRoutes)
app.use('/api/products', productRoutes)
app.use('/api/users', userRoutes)

export default app