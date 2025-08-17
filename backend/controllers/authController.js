import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Password strength validation
const validatePassword = (password) => {
  const minLength = 6;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  
  if (password.length < minLength) {
    return { isValid: false, message: "Password must be at least 6 characters long" };
  }
  if (!hasUpperCase || !hasLowerCase) {
    return { isValid: false, message: "Password must contain both uppercase and lowercase letters" };
  }
  if (!hasNumbers) {
    return { isValid: false, message: "Password must contain at least one number" };
  }
  
  return { isValid: true };
};

export const register = async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    
    // Input validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        message: "Name, email, and password are required" 
      });
    }
    
    // Password strength validation
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        message: passwordValidation.message 
      });
    }
    
    // Check if user already exists
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ 
        message: "Email already registered" 
      });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(password, salt);
    
    // Create user
    const user = await User.create({ 
      name, 
      email, 
      password: hash, 
      role: role || "user",
      phone: phone || ""
    });
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id.toString(), 
        role: user.role,
        email: user.email
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: "24h" }
    );
    
    // Return user data (without password)
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        phone: user.phone,
        isVerified: user.isVerified
      }, 
      token 
    });
    
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ 
      message: "Server error during registration",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        message: "Email and password are required" 
      });
    }
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        message: "Invalid credentials" 
      });
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        message: "Invalid credentials" 
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id.toString(), 
        role: user.role,
        email: user.email
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: "24h" }
    );
    
    res.json({
      success: true,
      message: "Login successful",
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        phone: user.phone,
        isVerified: user.isVerified
      }, 
      token 
    });
    
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      message: "Server error during login",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const me = async (req, res) => {
  try {
    const user = req.user;
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        profilePicture: user.profilePicture,
        isVerified: user.isVerified,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ 
      message: "Server error while fetching user data",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// New function: Change password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: "Current password and new password are required" 
      });
    }
    
    // Password strength validation
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        message: passwordValidation.message 
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);
    
    // Update password
    user.password = newPasswordHash;
    await user.save();
    
    res.json({
      success: true,
      message: "Password changed successfully"
    });
    
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ 
      message: "Server error while changing password",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
