import * as UserModel from '../models/UserModel.mjs'

export const createUser = async (req, res) => {
    const user = req.body
    try {
        const userId = await UserModel.createUser(user)
        console.log('userId: ', userId)
        res.status(201).json({ message: 'User created', userId })
    } catch (error) {
        res.status(400).json({ message: error })
    }
}

export const loginUser = async (req, res) =>{
    const user = req.body
    try {
        const userlogged = await UserModel.loginUser(user)
        res.status(200).json({ message: 'User logged in', userlogged })
    } catch (error) {
        res.status(400).json({ message: error })
    }
}

export const logoutUser = async (req, res) => {
    try {
        const userlogged = await UserModel.logoutUser(req.user)
        res.status(200).json({ message: 'User logged out', userlogged })
    } catch (error) {
        res.status(400).json({ message: error })
    }
}

export const forgotPassword = async (req, res) => {
    const user = req.body
    try {
        const userlogged = await UserModel.forgotPassword(user)
        res.status(200).json({ message: 'Password reset email sent', userlogged })
    } catch (error) {
        res.status(400).json({ message: error })
    }
}

export const valideCode = async (req, res) => {
    const codigo = req.body.codigo
    try {
        const userId = await UserModel.valideCode(codigo)
        res.status(200).json({ message: 'Code is valid', userId })
    } catch (error) {
        res.status(400).json({ message: error })
    }
}

export const resetPassword = async (req, res) => {
    const user = req.body
    try {
        const resetPassword = await UserModel.resetPassword(user)
        res.status(200).json({ message: 'Password reset', resetPassword })
    } catch (error) {
        res.status(400).json({ message: error })
    }
}