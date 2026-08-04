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


// ৭.৫ ADMIN CHECK MIDDLEWARE (অ্যাডমিন ভেরিফাই চেকপোস্ট)
const isAdmin = (req, res, next) => {
  // req.user এর ভেতরে থাকা রোল চেক করা হচ্ছে
  if (req.user && req.user.role === 'admin') {
    next(); // ইউজার অ্যাডমিন হলে ভেতরে যাওয়ার অনুমতি পাবে
  } else {
    // অ্যাডমিন না হলে অ্যাক্সেস ব্লক করা
    res.status(403).json({ message: "Access Denied! Admins only." });
  }
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



// ৫. USER SIGN UP (রেজিস্ট্রেশন - ওটিপি সহ)
app.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  // ইমেইল বা পাসওয়ার্ড খালি থাকলে এরর দেওয়া
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required!" });
  }

  try {
    // পাসওয়ার্ড হ্যাশ (Hash) করা হচ্ছে
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // ৬ ডিজিটের র্যান্ডম ওটিপি তৈরি করা
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // ওটিপির মেয়াদ ৫ মিনিট সেট করা হচ্ছে
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // ডাটাবেসে ইউজার সেভ করা (ওটিপি এবং মেয়াদের সময়সহ)
    const query = `
      INSERT INTO users (email, password, verification_otp, otp_expires_at) 
      VALUES ($1, $2, $3, $4) 
      RETURNING id, email, role, is_verified
    `;
    const values = [email, hashedPassword, otp, otpExpiresAt];
    
    const result = await pool.query(query, values);

    // ওটিপি ইমেইল সিমুলেশন (কনসোলে প্রিন্ট করা)
    console.log(`\n📬 [EMAIL SIMULATION] Verification OTP for user ${email}: ${otp}\n`);

    res.status(201).json({ 
      message: "Registration successful! Please verify your account using the OTP sent to your email.", 
      user: result.rows[0] 
    });
  } catch (error) {
    console.error("Signup error:", error);
    
    if (error.code === '23505') {
      return res.status(400).json({ message: "Email already exists!" });
    }
    res.status(500).json({ message: "Failed to register user" });
  }
});

// ৫.৫ VERIFY OTP (ওটিপি ভেরিফাই করা - আনপ্রোটেক্টেড রাউট)
app.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required!" });
  }

  try {
    // ইমেইল অনুযায়ী ইউজার খুঁজে বের করা
    const query = "SELECT * FROM users WHERE email = $1";
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found!" });
    }

    const user = result.rows[0];

    // ডাটাবেসে ওটিপি আছে কি না এবং ইউজারের পাঠানো ওটিপির সাথে মিলে কি না চেক করা
    if (!user.verification_otp || user.verification_otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP!" });
    }

    // ওটিপির মেয়াদ শেষ হয়ে গেছে কি না চেক করা (৫ মিনিট পার হয়েছে কি না)
    const currentTime = new Date();
    const otpExpiryTime = new Date(user.otp_expires_at);

    if (currentTime > otpExpiryTime) {
      return res.status(400).json({ message: "OTP has expired!" });
    }

    // ওটিপি সঠিক এবং মেয়াদ থাকলে ইউজারকে ভেরিফাইড (is_verified = true) করা 
    // এবং ডাটাবেস থেকে ওটিপি ও মেয়াদের মান মুছে ফেলা (NULL করে দেওয়া)
    const updateQuery = `
      UPDATE users 
      SET is_verified = true, verification_otp = NULL, otp_expires_at = NULL 
      WHERE id = $1 
      RETURNING id, email, is_verified
    `;
    const updateResult = await pool.query(updateQuery, [user.id]);

    res.status(200).json({ 
      message: "Account verified successfully! You can now login.", 
      user: updateResult.rows[0] 
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ message: "Internal Server Error" });
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
    
    // ইউজার অ্যাকাউন্ট ওটিপি দিয়ে ভেরিফাই করেছে কি না চেক করা
    if (!user.is_verified) {
      return res.status(401).json({ message: "Account is not verified! Please verify your OTP first." });
    }

        if (user.is_blocked) {
      return res.status(403).json({ message: "Your account has been blocked by the administrator." });
    }

    // পাসওয়ার্ড মিললে ও ভেরিফাইড হলে JWT টোকেন তৈরি করা
    const tokenPayload = { id: user.id, email: user.email, role: user.role };
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


// ১২. GET ALL USERS (অ্যাডমিন-অনলি রাউট - সব ইউজারের তালিকা দেখা)
app.get('/admin/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    // পাসওয়ার্ড ছাড়া অন্য সব কলামের ডাটা নিয়ে আসা হচ্ছে
    const result = await pool.query("SELECT id, email, role, name, phone FROM users ORDER BY id ASC");
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Admin query error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// ১৩. UPDATE USER ROLE (অ্যাডমিন-অনলি রাউট - ইউজারের রোল পরিবর্তন করা)
app.put('/admin/users/:id/role', authenticateToken, isAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  const { role } = req.body; // নতুন রোল (যেমন: 'admin' বা 'customer')

  if (!role) {
    return res.status(400).json({ message: "Role is required!" });
  }

  // নিরাপত্তা ভ্যালিডেশন (রোলটি কেবল 'admin' বা 'customer' হতে পারবে)
  if (role !== 'admin' && role !== 'customer') {
    return res.status(400).json({ message: "Invalid role! Must be 'admin' or 'customer'." });
  }

  try {
    // ডাটাবেসে ইউজারের রোল আপডেট করা
    const query = "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role";
    const result = await pool.query(query, [role, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found!" });
    }

    res.status(200).json({ 
      message: "User role updated successfully!", 
      user: result.rows[0] 
    });
  } catch (error) {
    console.error("Role update error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// ১৪. UPDATE PROFILE (প্রোফাইল আপডেট - সুরক্ষিত রাউট)
app.put('/profile', authenticateToken, async (req, res) => {
  const { name, phone } = req.body;

  try {
    const userId = req.user.id; // টোকেন থেকে সুরক্ষিত আইডি নেওয়া হচ্ছে

    // ডাটাবেস থেকে ইউজারের বর্তমান তথ্য তুলে আনা (যেন নতুন ডাটা না দিলে আগের ডাটাই থাকে)
    const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = userQuery.rows[0];

    // নাম বা ফোন না পাঠালে আগের তথ্যই বহাল থাকবে (Fallback)
    const updatedName = name || user.name;
    const updatedPhone = phone || user.phone;

    // ডাটাবেসে নাম ও ফোন আপডেট করা (RETURNING এর মাধ্যমে আপডেট করা প্রোফাইলটি ফেরত পাঠানো)
    const updateQuery = "UPDATE users SET name = $1, phone = $2 WHERE id = $3 RETURNING id, email, name, phone, role";
    const result = await pool.query(updateQuery, [updatedName, updatedPhone, userId]);

    res.status(200).json({ 
      message: "Profile updated successfully!", 
      user: result.rows[0] 
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ১৫. BLOCK/UNBLOCK USER (অ্যাডমিন-অনলি রাউট - ইউজার ব্লক বা আনব্লক করা)
app.put('/admin/users/:id/block', authenticateToken, isAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  const { isBlocked } = req.body; // বডি থেকে true অথবা false নেওয়া হচ্ছে

  if (isBlocked === undefined) {
    return res.status(400).json({ message: "isBlocked status (true/false) is required!" });
  }

  try {
    // ডাটাবেসে ইউজারকে ব্লক বা আনব্লক করা
    const query = "UPDATE users SET is_blocked = $1 WHERE id = $2 RETURNING id, email, role, is_blocked";
    const result = await pool.query(query, [isBlocked, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found!" });
    }

    const statusMessage = isBlocked ? "blocked" : "unblocked";
    res.status(200).json({ 
      message: `User account has been successfully ${statusMessage}!`, 
      user: result.rows[0] 
    });
  } catch (error) {
    console.error("Block user error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});



app.get("/", (req,res)=>{
  res.send("server started successful");
})

app.listen(PORT, ()=>{
  console.log(`Server is running at http://localhost:${PORT}`);
});