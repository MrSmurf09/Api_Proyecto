import * as CategoryModel from '../models/CategoryModel.mjs'

export const createCategory = async (req, res) => {
    const { name } = req.body
    const categoryId = await CategoryModel.createCategory({ name })
    res.json({ categoryId })
}
