const path = require('node:path');
const Mocha = require('mocha');
const glob = require('glob');
exports.run = () => new Promise((resolve, reject) => {
  const mocha = new Mocha({ ui: 'tdd', color: true });
  for (const file of glob.sync('**/*.test.js', { cwd: __dirname })) mocha.addFile(path.resolve(__dirname, file));
  mocha.run(failures => failures ? reject(new Error(`${failures} integration tests failed`)) : resolve());
});
