const app = require('./app');

init();

async function init() {
  if (process.env.NODE_ENV !== 'test'){
  try {
    app.listen(3001, () => {
      console.log('Express App Listening on Port 3001');
    });
  } catch (error) {
    console.error(`An error occurred: ${JSON.stringify(error)}`);
    process.exit(1);
  }
}
}
