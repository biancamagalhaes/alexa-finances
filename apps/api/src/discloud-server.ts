process.env.PORT ??= '8080';
process.env.HOST ??= '0.0.0.0';
process.env.NODE_ENV ??= 'production';

await import('./server.js');
