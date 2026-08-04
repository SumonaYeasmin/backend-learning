import express from 'express';
import {
  signup,
  verifyOtp,
  login,
  getProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  updateProfile,
  deleteOwnAccount,
  getAllUsers,
  updateUserRole,
  blockUser,
  adminDeleteUser
} from '../controllers/authController.js';
import { authenticateToken, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// ৫. SIGN UP
router.post('/signup', signup);

// ৫.৫ VERIFY OTP
router.post('/verify-otp', verifyOtp);

// ৬. LOGIN
router.post('/login', login);

// ৮. PROFILE
router.get('/profile', authenticateToken, getProfile);

// ১৪. UPDATE PROFILE
router.put('/profile', authenticateToken, updateProfile);

// ১৬. DELETE OWN ACCOUNT
router.delete('/profile', authenticateToken, deleteOwnAccount);

// ৯. CHANGE PASSWORD
router.put('/change-password', authenticateToken, changePassword);

// ১০. FORGOT PASSWORD
router.post('/forgot-password', forgotPassword);

// ১১. RESET PASSWORD
router.post('/reset-password/:id/:token', resetPassword);

// --- ADMIN ROUTES ---

// ১২. GET ALL USERS
router.get('/admin/users', authenticateToken, isAdmin, getAllUsers);

// ১৩. UPDATE USER ROLE
router.put('/admin/users/:id/role', authenticateToken, isAdmin, updateUserRole);

// ১৫. BLOCK/UNBLOCK USER
router.put('/admin/users/:id/block', authenticateToken, isAdmin, blockUser);

// ১৭. ADMIN DELETE USER
router.delete('/admin/users/:id', authenticateToken, isAdmin, adminDeleteUser);

export default router;
