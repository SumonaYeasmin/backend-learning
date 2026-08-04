import express from 'express';
import { 
  getProducts, 
  createProduct, 
  updateProduct, 
  deleteProduct 
} from '../controllers/productController.js';
import { authenticateToken } from '../middlewares/auth.js';

const router = express.Router();

// ১. GET ALL PRODUCTS
router.get('/', getProducts);

// ২. Add Product
router.post('/', authenticateToken, createProduct);

// ৩. Update Product
router.put('/:id', updateProduct);

// ৪. DELETE PRODUCT
router.delete('/:id', deleteProduct);

export default router;
