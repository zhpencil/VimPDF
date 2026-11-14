const sharp = require('sharp')

sharp('build/icon.svg')
  .resize(1024, 1024)
  .png()
  .toFile('build/icon.png')
  .then(() => console.log('build/icon.png generated'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
