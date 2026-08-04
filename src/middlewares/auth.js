import jwt from "jsonwebtoken";

// ৭. AUTH MIDDLEWARE (অথেনটিকেশন চেকপোস্ট)
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Access Token Required! Please login." });
  }

  const jwtSecret = process.env.JWT_SECRET;

  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or Expired Token!" });
    }
    
    req.user = user;
    next();
  });
};

// ৭.৫ ADMIN CHECK MIDDLEWARE (অ্যাডমিন ভেরিফাই চেকপোস্ট)
export const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: "Access Denied! Admins only." });
  }
};
