const cloudinary = require('../config/cloudinary')

exports.uploadImage = async (req, res) => {
  try {
    const { dataUrl } = req.body
    
    if (!dataUrl) {
      return res.status(400).json({ error: 'dataUrl is required' })
    }
    
    const result = await cloudinary.uploader.upload(dataUrl, {
      folder: 'hdm-stream',
      resource_type: 'image',
      transformation: [
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    })
    
    const downloadUrl = cloudinary.url(result.public_id, {
      flags: 'attachment',
      resource_type: 'image'
    })
    
    res.json({
      success: true,
      url: result.secure_url,
      downloadUrl: downloadUrl,
      publicId: result.public_id
    })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ error: 'Upload failed' })
  }
}

exports.deleteImage = async (req, res) => {
  try {
    const { publicId } = req.body
    
    if (!publicId) {
      return res.status(400).json({ error: 'publicId is required' })
    }
    
    await cloudinary.uploader.destroy(publicId)
    
    res.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    res.status(500).json({ error: 'Delete failed' })
  }
}