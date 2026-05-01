// Entry point for device-forecast backend server
const app = require('./api');

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Device-forecast backend running on port ${PORT}`);
});
