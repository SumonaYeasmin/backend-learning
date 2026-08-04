import pool from '../config/db.js';

// ১. GET ALL PRODUCTS (Read)
export const getProducts = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id ASC");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ২. Add Product (Create)
export const createProduct = async (req, res) => {
  try {
    const { name, price } = req.body;

    if (!name || !price) {
      return res.status(400).json({ message: "Name and price are required" });
    }

    const result = await pool.query(
      "INSERT INTO products(name, price) VALUES ($1, $2) RETURNING *",
      [name, price]
    );

    res.status(201).json({ message: "Product added successfully!", product: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ৩. Update Product (Update)
export const updateProduct = async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { name, price } = req.body;

    const checkProduct = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
    
    if (checkProduct.rows.length === 0) {
      return res.status(404).json({ message: "Product not found in DB" });
    }
    const currentProduct = checkProduct.rows[0];
    
    const updatedName = name || currentProduct.name;
    const updatedPrice = price !== undefined ? Number(price) : currentProduct.price;

    const result = await pool.query(
      "UPDATE products SET name = $1, price = $2 WHERE id = $3 RETURNING *",
      [updatedName, updatedPrice, productId]
    );
    
    res.status(200).json({ message: "Product updated successfully", product: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ৪. DELETE PRODUCT (Delete)
export const deleteProduct = async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const result = await pool.query("DELETE FROM products WHERE id = $1 RETURNING *", [productId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found in DB" });
    }
    res.status(200).json({ message: "Product deleted successfully from DB", product: result.rows[0] });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
