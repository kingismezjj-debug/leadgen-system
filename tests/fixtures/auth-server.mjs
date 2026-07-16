import { app } from '../../server/index.mjs';

const server = app.listen(0, '127.0.0.1', () => {
  const address = server.address();
  process.send?.({ port: address.port });
});

async function close() {
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
}

process.on('message', (message) => {
  if (message === 'close') close();
});

process.on('SIGTERM', close);
