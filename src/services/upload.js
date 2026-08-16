const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const uploadDir = process.env.AWS_LAMBDA_FUNCTION_NAME
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, '..', '..', 'data', 'uploads');
const productsDir = path.join(uploadDir, 'products');
const bannersDir = path.join(uploadDir, 'banners');

[uploadDir, productsDir, bannersDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.uploadType || 'products';
    cb(null, type === 'banners' ? bannersDir : productsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${uuidv4()}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  if (!file.originalname) {
    return cb(null, false);
  }
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function getPublicPath(type, filename) {
  return `/uploads/${type}/${filename}`;
}

function deleteFile(type, filename) {
  if (!filename) return;
  const filePath = type === 'banners' 
    ? path.join(bannersDir, filename)
    : path.join(productsDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = {
  upload,
  getPublicPath,
  deleteFile,
  productsDir,
  bannersDir,
};