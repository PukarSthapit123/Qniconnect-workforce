import { downloadText } from './download';

test('a download is refused, and says so, when the browser cannot build a file', () => {
  const was = URL.createObjectURL;
  Object.defineProperty(URL, 'createObjectURL', { value: undefined, configurable: true, writable: true });
  try {
    expect(downloadText('x.csv', 'a')).toBe(false);
  } finally {
    Object.defineProperty(URL, 'createObjectURL', { value: was, configurable: true, writable: true });
  }
});
