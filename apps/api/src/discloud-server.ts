process.env.PORT ??= '8080';
process.env.HOST ??= '0.0.0.0';

await import('./server.js');
