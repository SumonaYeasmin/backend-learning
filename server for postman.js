import express from "express";
const app = express();
const PORT = 5000;

app.use(express.json());

let products = [
  { id: 1, name: "Laptop", price: 1200 },
  { id: 2, name: "Phone", price: 800 },
  { id: 3, name: "Keyboard", price: 50 }
];


//  GET ALL PRODUCTS (Read Operation) - আমাদের লোকাল প্রোডাক্টগুলো রিড করবে
app.get('/products', (req, res) => {
  res.json(products);
});

//২. ADD PRODUCT (Create - POST)

app.post('/products',(req,res)=>{
  const {name,price} = req.body;

  const newProduct = {
    id: products.length + 1,
    name,
    price
  };

  if (!name || !price) {
    return res.status(400).json({ message: "Name and price are required" });
  }

  products.push(newProduct);

    res.status(201).json({ message: "Product added successfully!", product: newProduct });

});

// ৩. UPDATE PRODUCT (Update - PUT) - নির্দিষ্ট প্রোডাক্টের ডাটা আপডেট করা

app.put('/products/:id',(req,res)=>{
  const productId = parseInt(req.params.id);
  const {name,price}= req.body;

  const product = products.find(p => p.id === productId);


  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  if(name) product.name = name;
  if(price) product.price = price;

  res.status(200).json({message:"Product updated successfully", product});
  
})


// ৪. DELETE PRODUCT (Delete - DELETE)

app.delete('/products/:id', (req, res) => {
  const productId = parseInt(req.params.id);
  const product = products.find(p => p.id === productId);

   if(!product){
    return res.status(404).json({message:"Product not found"});
  }

  const index = products.indexOf(product)
  products.splice(index, 1);
  res.status(200).json({message:"Product deleted successfully"})

  




});

// ১. Home Route
app.get('/', (req, res) => {
  res.send('Hello World! My backend is working with ES Modules!');
});



// সার্ভারটি চালু করা
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
