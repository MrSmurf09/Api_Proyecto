import { Router } from 'express'
import * as userController from '../controllers/userController.mjs'
import * as auth from '../middlewares/authUsers.mjs'

const router = Router()

router.post('/create', userController.createUser)
router.post('/login', userController.loginUser)
router.post('/logout', auth.authUsers, userController.logoutUser)
router.post('/forgot-password', userController.forgotPassword)
router.post('/valide-code', userController.valideCode)
router.put('/reset-password', userController.resetPassword)

export default router