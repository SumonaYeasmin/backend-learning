import express from "express";
import bcrypt from "bcrypt"
import { Pool } from "pg";
import jwt from "jsonwebtoken";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

const connectionString = process.env.DATABASE_URL;


const pool = new  Pool({
  connectionString:connectionString,
});

// AUTH MIDDLEWARE (অথেনটিকেশন চেকপোস্ট)

const authenticateToken = (req, res, next) => {
  // রিকোয়েস্ট হেডার থেকে Authorization ফিল্ডটি নেওয়া
  const authHeader = req.headers['authorization'];
  
  // সাধারণত টোকেনটি "Bearer <TOKEN_STRING>" আকারে পাঠানো হয়, তাই স্পেস দিয়ে আলাদা করে শুধু টোকেনটি নেওয়া হচ্ছে
  const token = authHeader && authHeader.split(' ')[1];

  // যদি টোকেন না পাঠানো হয়
  if (!token) {
    return res.status(401).json({ message: "Access Token Required! Please login." });
  }

  const jwtSecret = process.env.JWT_SECRET;

  // টোকেনটি সঠিক কি না এবং মেয়াদ আছে কি না তা যাচাই করা
  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or Expired Token!" });
    }
    
    // টোকেন সঠিক হলে ইউজারের তথ্য (id, email) রিকোয়েস্ট অবজেক্টে রেখে দেওয়া
    req.user = user;
    next(); // এটি কল করার মাধ্যমে রিকোয়েস্টটি পরবর্তী রাউটে যাওয়ার অনুমতি পায়
  });
};


// ১. GET ALL PRODUCTS (PostgreSQL ডাটাবেস থেকে রিড করবে)

app.get('/products', async(req,res) => {
  try{
    const result = await pool.query("SELECT * FROM products ORDER BY id ASC");
    res.json(result.rows);
  }catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ২. Add Product (Create - POST)

app.post('/products', authenticateToken, async(req,res)=>{
  try {
    const {name , price} = req.body;

    if(!name || !price){
      return res.status(400).json({message:"Name and price are required"})
    }

    const result = await pool.query("INSERT INTO products(name , price) VALUES ($1 , $2) RETURNING *", [name , price]);

    res.status(201).json({ message: "Product added successfully!", product: result.rows[0] });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// ৩. Update Product (Update - PUT)

app.put('/products/:id', async(req,res)=>{
  try {
    const productId = parseInt(req.params.id);
    const { name, price } = req.body;


// প্রথমে ডাটাবেসে প্রোডাক্টটি আছে কি না তা খুঁজে দেখা
    const checkProduct = await pool.query("SELECT * FROM products WHERE id = $1", [productId]);
    
    if (checkProduct.rows.length === 0) {
      return res.status(404).json({ message: "Product not found in DB" });
    }
    const currentProduct = checkProduct.rows[0];
    
    // নতুন ডাটা না পাঠানো হলে ডাটাবেসে থাকা আগের ডাটাই ব্যবহার করা হবে (Fallback)
    const updatedName = name || currentProduct.name;
    const updatedPrice = price !== undefined ? Number(price) : currentProduct.price;

    const result = await pool.query("UPDATE products SET name = $1 , price = $2 WHERE id = $3 RETURNING *", [name , price , productId]);
    
    if(!result.rows[0]){
      return res.status(404).json({message:"Product not found"});
    }
    
    res.status(200).json({message:"Product updated successfully", product: result.rows[0]});
  } catch (error) {
    console.log(error);
    res.status(500).json({message:"Internal Server Error"});
  }
});


// ৪. DELETE PRODUCT (Delete - DELETE) - ডাটাবেস থেকে প্রোডাক্ট মুছে ফেলা
app.delete('/products/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    // ডাটাবেস থেকে প্রোডাক্ট ডিলিট করার কোয়েরি
    const result = await pool.query("DELETE FROM products WHERE id = $1 RETURNING *", [productId]);
    // যদি ডিলিট করার পর কোনো রো ফেরত না আসে, তার মানে ঐ আইডি-র কোনো প্রোডাক্ট ছিল না
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found in DB" });
    }
    res.status(200).json({ message: "Product deleted successfully from DB", product: result.rows[0] });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});



// ৫. USER SIGN UP (রেজিস্ট্রেশন)
app.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  // ইমেইল বা পাসওয়ার্ড খালি থাকলে এরর দেওয়া
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required!" });
  }

  try {
    // পাসওয়ার্ড হ্যাশ (Hash) করা হচ্ছে যেন হ্যাকার ডাটাবেস হ্যাক করলেও পাসওয়ার্ড না বুঝতে পারে
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // ডাটাবেসে ইউজার সেভ করা (RETURNING id, email এর অর্থ সেভ হওয়ার পর শুধু আইডি ও ইমেইল ফেরত দিবে, পাসওয়ার্ড দিবে না)
    const query = "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email";
    const values = [email, hashedPassword];
    
    const result = await pool.query(query, values);

    res.status(201).json({ 
      message: "User registered successfully!", 
      user: result.rows[0] 
    });
  } catch (error) {
    console.error("Signup error:", error);
    
    // Postgres-এ ইউনিক এরর কোড '23505' (ইমেইলটি ডাটাবেসে আগে থেকেই থাকলে)
    if (error.code === '23505') {
      return res.status(400).json({ message: "Email already exists!" });
    }
    res.status(500).json({ message: "Failed to register user" });
  }
});


// ৬. USER LOGIN (লগইন)
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required!" });
  }

  try {
    // ইমেইল অনুযায়ী ডাটাবেস থেকে ইউজার খুঁজে বের করা
    const query = "SELECT * FROM users WHERE email = $1";
    const result = await pool.query(query, [email]);

    // যদি ইউজার খুঁজে না পাওয়া যায়
    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid email or password!" });
    }

    const user = result.rows[0];

    // পাসওয়ার্ড চেক করা (ইনপুট পাসওয়ার্ড বনাম ডাটাবেসের হ্যাশ করা পাসওয়ার্ড)
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid email or password!" });
    }

    // পাসওয়ার্ড মিললে JWT টোকেন তৈরি করা
    const tokenPayload = { id: user.id, email: user.email };
    const jwtSecret = process.env.JWT_SECRET; // এটি একটি গোপন চাবি
    
    // টোকেন তৈরি (যা ১ ঘণ্টার জন্য ভ্যালিড থাকবে)
    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '1h' });

    res.status(200).json({ 
      message: "Login successful!", 
      token: token 
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Failed to login" });
  }
});


// ৮. USER PROFILE (প্রোফাইল - সুরক্ষিত রাউট)
app.get('/profile', authenticateToken, (req, res) => {
  // req.user এর মধ্যে ইউজারের ডাটা আছে যা আমাদের মিডলওয়্যার সেট করেছে
  res.status(200).json({
    message: "Profile retrieved successfully",
    user: req.user
  });
});


// ৯. CHANGE PASSWORD (পাসওয়ার্ড পরিবর্তন - সুরক্ষিত রাউট)
app.put('/change-password', authenticateToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: "Old password and new password are required!" });
  }

  try {
    const userId = req.user.id; // টোকেন থেকে ইউজারের আইডি নেওয়া হচ্ছে

    // ডাটাবেস থেকে ইউজারের বর্তমান পাসওয়ার্ড তুলে আনা
    const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = userQuery.rows[0];

    // পুরাতন পাসওয়ার্ড সঠিক কি না চেক করা
    const isOldPasswordCorrect = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordCorrect) {
      return res.status(400).json({ message: "Old password is incorrect!" });
    }

    // নতুন পাসওয়ার্ড হ্যাশ করা
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // ডাটাবেসে নতুন পাসওয়ার্ড আপডেট করা
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedNewPassword, userId]);

    res.status(200).json({ message: "Password changed successfully!" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
});


// ১০. FORGOT PASSWORD (পাসওয়ার্ড ভুলে গেলে - আনপ্রোটেক্টেড রাউট)
app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required!" });
  }

  try {
    // ইমেইল অনুযায়ী ইউজার খুঁজে বের করা
    const query = "SELECT * FROM users WHERE email = $1";
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User with this email does not exist!" });
    }

    const user = result.rows[0];

    // ১৫ মিনিটের জন্য একটি ওয়ান-টাইম টোকেন তৈরি করা
    const tokenPayload = { id: user.id, email: user.email };
    
    // সিকিউরিটির জন্য আমরা এই টোকেনটির চাবি হিসেবে মেইন JWT_SECRET এর সাথে ইউজারের বর্তমান পাসওয়ার্ড যুক্ত করে দিই। 
  
    const tempSecret = process.env.JWT_SECRET + user.password;
    const resetToken = jwt.sign(tokenPayload, tempSecret, { expiresIn: '15m' });

 
    const resetLink = `http://localhost:5000/reset-password/${user.id}/${resetToken}`;
    console.log("\n📬 [EMAIL SIMULATION] Reset Link sent to user:");
    console.log(resetLink);
    console.log("\n");

    res.status(200).json({ 
      message: "Reset link generated successfully! Check your server console (terminal)." 
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// ১১. RESET PASSWORD (পাসওয়ার্ড রিসেট করা - আনপ্রোটেক্টেড রাউট)
app.post('/reset-password/:id/:token', async (req, res) => {
  const { id, token } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ message: "New password is required!" });
  }

  try {
    const userId = parseInt(id);

    // ডাটাবেস থেকে ইউজারের বর্তমান তথ্য তুলে আনা (পাসওয়ার্ড চাবির অংশ হিসেবে লাগবে)
    const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ message: "User not found!" });
    }

    const user = userQuery.rows[0];

    // টোকেন যাচাইয়ের জন্য সেম সিক্রেট তৈরি করা (JWT_SECRET + বর্তমান পাসওয়ার্ড)
    const tempSecret = process.env.JWT_SECRET + user.password;

    // টোকেন ভেরিফাই করা
    jwt.verify(token, tempSecret, async (err, decoded) => {
      if (err) {
        return res.status(400).json({ message: "Invalid or Expired Reset Link!" });
      }

      // নতুন পাসওয়ার্ড হ্যাশ করা
      const saltRounds = 10;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // ডাটাবেসে নতুন পাসওয়ার্ড আপডেট করা
      await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedNewPassword, userId]);

      res.status(200).json({ message: "Password reset successfully! You can now login with your new password." });
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});



app.get("/", (req,res)=>{
  res.send("server started successful");
})

app.listen(PORT, ()=>{
  console.log(`Server is running at http://localhost:${PORT}`);
});