import pool from '../config/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// ৫. USER SIGN UP (রেজিস্ট্রেশন)
export const signup = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required!" });
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const query = `
      INSERT INTO users (email, password, verification_otp, otp_expires_at) 
      VALUES ($1, $2, $3, $4) 
      RETURNING id, email, role, is_verified
    `;
    const values = [email, hashedPassword, otp, otpExpiresAt];
    
    const result = await pool.query(query, values);

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
};

// ৫.৫ VERIFY OTP (ওটিপি ভেরিফাই করা)
export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required!" });
  }

  try {
    const query = "SELECT * FROM users WHERE email = $1";
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found!" });
    }

    const user = result.rows[0];

    if (!user.verification_otp || user.verification_otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP!" });
    }

    const currentTime = new Date();
    const otpExpiryTime = new Date(user.otp_expires_at);

    if (currentTime > otpExpiryTime) {
      return res.status(400).json({ message: "OTP has expired!" });
    }

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
};

// ৬. USER LOGIN (লগইন)
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required!" });
  }

  try {
    const query = "SELECT * FROM users WHERE email = $1";
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Invalid email or password!" });
    }

    const user = result.rows[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid email or password!" });
    }

    if (!user.is_verified) {
      return res.status(401).json({ message: "Account is not verified! Please verify your OTP first." });
    }

    if (user.is_blocked) {
      return res.status(403).json({ message: "Your account has been blocked by the administrator." });
    }

    const tokenPayload = { id: user.id, email: user.email, role: user.role };
    const jwtSecret = process.env.JWT_SECRET;
    
    const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '1h' });

    res.status(200).json({ 
      message: "Login successful!", 
      token: token 
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Failed to login" });
  }
};

// ৮. USER PROFILE (প্রোফাইল)
export const getProfile = (req, res) => {
  res.status(200).json({
    message: "Profile retrieved successfully",
    user: req.user
  });
};

// ৯. CHANGE PASSWORD (পাসওয়ার্ড পরিবর্তন)
export const changePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: "Old password and new password are required!" });
  }

  try {
    const userId = req.user.id;

    const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = userQuery.rows[0];

    const isOldPasswordCorrect = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordCorrect) {
      return res.status(400).json({ message: "Old password is incorrect!" });
    }

    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedNewPassword, userId]);

    res.status(200).json({ message: "Password changed successfully!" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
};

// ১০. FORGOT PASSWORD
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required!" });
  }

  try {
    const query = "SELECT * FROM users WHERE email = $1";
    const result = await pool.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User with this email does not exist!" });
    }

    const user = result.rows[0];

    const tokenPayload = { id: user.id, email: user.email };
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
};

// ১১. RESET PASSWORD
export const resetPassword = async (req, res) => {
  const { id, token } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ message: "New password is required!" });
  }

  try {
    const userId = parseInt(id);

    const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ message: "User not found!" });
    }

    const user = userQuery.rows[0];
    const tempSecret = process.env.JWT_SECRET + user.password;

    jwt.verify(token, tempSecret, async (err, decoded) => {
      if (err) {
        return res.status(400).json({ message: "Invalid or Expired Reset Link!" });
      }

      const saltRounds = 10;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedNewPassword, userId]);

      res.status(200).json({ message: "Password reset successfully! You can now login with your new password." });
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ১৪. UPDATE PROFILE
export const updateProfile = async (req, res) => {
  const { name, phone } = req.body;

  try {
    const userId = req.user.id;

    const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);
    const user = userQuery.rows[0];

    const updatedName = name || user.name;
    const updatedPhone = phone || user.phone;

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
};

// ১৬. DELETE OWN ACCOUNT
export const deleteOwnAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = "DELETE FROM users WHERE id = $1 RETURNING id, email";
    const result = await pool.query(query, [userId]);

    res.status(200).json({ 
      message: "Your account has been deleted successfully!", 
      deletedUser: result.rows[0] 
    });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ১২. GET ALL USERS (Admin)
export const getAllUsers = async (req, res) => {
  try {
    const result = await pool.query("SELECT id, email, role, name, phone FROM users ORDER BY id ASC");
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Admin query error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// ③. UPDATE USER ROLE (Admin)
export const updateUserRole = async (req, res) => {
  const userId = parseInt(req.params.id);
  const { role } = req.body;

  if (!role) {
    return res.status(400).json({ message: "Role is required!" });
  }

  if (role !== 'admin' && role !== 'customer') {
    return res.status(400).json({ message: "Invalid role! Must be 'admin' or 'customer'." });
  }

  try {
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
};

// ১৫. BLOCK/UNBLOCK USER (Admin)
export const blockUser = async (req, res) => {
  const userId = parseInt(req.params.id);
  const { isBlocked } = req.body;

  if (isBlocked === undefined) {
    return res.status(400).json({ message: "isBlocked status (true/false) is required!" });
  }

  try {
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
};

// ১৭. ADMIN DELETE USER (Admin)
export const adminDeleteUser = async (req, res) => {
  try {
    const userIdToDelete = parseInt(req.params.id);

    if (userIdToDelete === req.user.id) {
      return res.status(400).json({ message: "Admins cannot delete themselves!" });
    }

    const query = "DELETE FROM users WHERE id = $1 RETURNING id, email, role";
    const result = await pool.query(query, [userIdToDelete]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found!" });
    }

    res.status(200).json({ 
      message: "User account has been deleted successfully by admin!", 
      deletedUser: result.rows[0] 
    });
  } catch (error) {
    console.error("Admin delete user error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
