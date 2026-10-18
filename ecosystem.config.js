module.exports = {
  apps: [
    {
      name: 'whatsapp-bot',
      script: 'bot.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PATH: 'C:\\Users\\kumar\\nodejs;' + process.env.PATH
      }
    }
  ]
};
