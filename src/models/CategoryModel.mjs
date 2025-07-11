import db from '../config/db.mjs'

export const createCategory = async (category) => {
    const categoryExists = await db('category').where('name', category.name).first()
    if(categoryExists) {
        throw new Error('Category already exists')
    }
    const [category_id] = await db('category').insert(category)
    return category_id
}