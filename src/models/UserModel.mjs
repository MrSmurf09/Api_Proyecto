import db from '../config/db.mjs'
import bcrypt from 'bcryptjs'
import * as authUsers from '../middlewares/authUsers.mjs'
import nodemailer from 'nodemailer'

const codigosVerificacion = new Map()

export const createUser = async (user) => {
    console.log('user: ', user)
    try {
        const { email, password, username, name, phone } = user
        if (!user.email || !user.password || !user.username || !user.name || !user.phone) {
            throw new Error('Missing required fields')
        }
        if (user.username.length > 20) {
            throw new Error('Username must be less than 20 characters')
        }
        const emailExists = await db('users').where('email', user.email).first()
        if (emailExists) {
            throw new Error('Email already exists')
        }
        const phoneExists = await db('users').where('phone', user.phone).first()
        if (phoneExists) {
            throw new Error('Phone already exists')
        }
        const hashedPassword = await bcrypt.hash(password, 10)
        const [userId] = await db('users').insert({
            name,
            username,
            email,
            phone,
            password: hashedPassword,
        })
        console.log('userId: ', userId)
        return { userId }
    } catch (error) {
        console.log(error)
        throw error
    }
}

export const loginUser = async (user) => {
    try {
        const { account , password } = user
        const userExists = await db('users').where('username', account).orWhere('email', account).first()
        if (!userExists) {
            console.log('user does not exist')
            throw new Error('User not found')
        }
        const validPassword = await bcrypt.compare(password, userExists.password)
        if (!validPassword) {
            console.log('invalid password')
            throw new Error('Invalid password')
        }
        const token = await authUsers.generateToken({ userId: userExists.user_id, username: userExists.username })
        await db('tokens').insert({ user_id: userExists.user_id, token })

        return { userId: userExists.user_id, username: userExists.username, token }
    } catch (error) {
        console.log(error)
        throw error
    }
}

export const logoutUser = async (user) => {
    try {
        const id = user.userId
        const token = await db('tokens').where('user_id', id).first()
        await db('tokens').where('user_id', id).del()
        return { message: 'User logged out', token }
    } catch (error) {
        console.log(error)
        throw error
    }
}

export const createUserMail = async (user, codigo) => {
    console.log('user: ', user)
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.PASS_EMAIL,
        },
    })

    const mailOptions = {
        from: 'josvermarquez16@gmail.com',
        to: user.email,
        subject: 'Reset your password',
        text: 'Hello,\n\nthis is your password reset code: ' + codigo,
    }

    await transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error)
        } else {
            console.log('Email sent: ' + info.response)
        }
    })
}

export const forgotPassword = async (user) => {
    try {
        const { email } = user
        const userExists = await db('users').where('email', email).first()
        if (!userExists) {
            throw new Error('User not found')
        }
        const codigo = Math.floor(100000 + Math.random() * 900000).toString()
        createUserMail(user, codigo)
        codigosVerificacion.set(codigo, userExists.email)
        return { message: 'Password reset email sent' }
    } catch (error) {
        console.log(error)
        throw error
    }
}

export const valideCode = async (codigo) => {
    const codeExists = codigosVerificacion.get(codigo)
    if(!codeExists) {
        throw new Error('Code not found')
    }
    if(codigosVerificacion.get(codigo) === 0) {
        throw new Error('Code is invalid')
    }
    codigosVerificacionVerificacion.delete(codigo)
    return codeExists
}

export const resetPassword = async (user) => {
    try {
        const { email } = user
        const userExists = await db('users').where('email', email).first()
        if (!userExists) {
            throw new Error('User not found')
        }
        await db('users').where('email', email).update({ password: user.password })
        return { message: 'Password reset' }
    } catch (error) {
        console.log(error)
        throw error
    }
}