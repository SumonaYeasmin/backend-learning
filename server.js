import express from "express";
import productRoutes from "./src/routes/productRoutes.js";
import authRoutes from "./src/routes/authRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// Routes Mount (রাউটগুলো মাউন্ট করা)
app.use("/products", productRoutes); // সব প্রোডাক্ট এপিআই /products ইউআরএল-এ থাকবে
app.use("/", authRoutes);           // সব ইউজার ও অথ এপিআই রুট লেভেলে থাকবে

app.get("/", (req, res) => {
  res.send("server started successful");
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});