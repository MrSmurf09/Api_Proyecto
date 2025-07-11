import jwt from 'jsonwebtoken'
import db from '../config/db.mjs'

export const authUsers = async (req, res, next) => {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(402).json({ message: 'No token provided or format is invalid' })
    }

    const token = authHeader.split(' ')[1]

    if (!token) {
        return res.status(401).json({ message: 'No token provided' })
    }

    const tokenExists = await db('tokens').where('token', token).first()

    if(!tokenExists) {
        return res.status(401).json({ message: 'Token not found or expired' })
    }
    if(tokenExists.status === 0) {
        return res.status(401).json({ message: 'Token is invalid or expired' })
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decoded
        next()
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' })
    }
}

export const generateToken = async (user) => {
    if (!user) {
        throw new Error('User is required')
    }
    try {
        const expiresIn = '8h'
        const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn })
        return token
    } catch (error) {
        throw new Error('Error generating token')
    }
}