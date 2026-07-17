// PM2 进程配置（单实例 fork 模式）
// 日志输出至 /var/log/poker-server/，配合 pm2-logrotate 模块进行轮转。
//
// 首次部署后执行以下命令安装并配置日志轮转：
//   pm2 install pm2-logrotate
//   pm2 set pm2-logrotate:max_size 10M
//   pm2 set pm2-logrotate:retain 14
//   pm2 set pm2-logrotate:compress true
//   pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
//
// 平滑重载（零停机）：
//   pm2 reload poker-server

const logDirectory = '/var/log/poker-server';

module.exports = {
  apps: [
    {
      name: 'poker-server',
      script: 'dist/server.js',
      cwd: '/var/www/poker-server',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      min_uptime: '5s',
      max_restarts: 10,
      restart_delay: 1000,
      exp_backoff_restart_delay: 2000,
      // SIGTERM drains every table's actor queue then writes a confidential
      // per-table snapshot to Redis (poker:snapshot:{tableId}).
      kill_timeout: 15000,
      kill_signal: 'SIGTERM',
      shutdown_with_message: true,
      listen_timeout: 10000,
      max_memory_restart: '256M',
      vizion: false,
      time: true,
      merge_logs: true,
      out_file: `${logDirectory}/out.log`,
      error_file: `${logDirectory}/error.log`,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
        METRICS_PORT: 9091,
        // Loaded from /etc/poker-server/env by the deploy workflow; never commit a Redis URL.
        // Backs reconnect tokens, the table registry, and the event-sourced snapshot/stream store.
        REDIS_URL: process.env.REDIS_URL,
      },
    },
  ],
};
