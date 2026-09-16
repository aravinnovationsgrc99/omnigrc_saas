import { jcsCanonicalize } from './index';

describe('RFC 8785 JSON Canonicalization Scheme (JCS)', () => {
  it('should format object keys in lexicographical order regardless of insertion order', () => {
    const obj1 = { z: 1, a: 2, m: { y: 'hello', b: 'world' } };
    const obj2 = { a: 2, m: { b: 'world', y: 'hello' }, z: 1 };

    const serialized1 = jcsCanonicalize(obj1);
    const serialized2 = jcsCanonicalize(obj2);

    expect(serialized1).toEqual(serialized2);
    expect(serialized1).toEqual('{"a":2,"m":{"b":"world","y":"hello"},"z":1}');
  });

  it('should preserve array element ordering', () => {
    const arr1 = { items: [3, 1, 2] };
    const arr2 = { items: [1, 2, 3] };

    expect(jcsCanonicalize(arr1)).toEqual('{"items":[3,1,2]}');
    expect(jcsCanonicalize(arr1)).not.toEqual(jcsCanonicalize(arr2));
    expect(jcsCanonicalize(arr2)).toEqual('{"items":[1,2,3]}');
  });

  it('should format numbers, booleans, null, and escaped strings correctly', () => {
    const payload = {
      enabled: true,
      data: null,
      val: 42,
      str: 'Hello\nWorld',
    };

    const canonical = jcsCanonicalize(payload);
    expect(canonical).toEqual('{"data":null,"enabled":true,"str":"Hello\\nWorld","val":42}');
  });

  it('should throw an error for un-serializable values (functions, undefined)', () => {
    expect(() => jcsCanonicalize({ fn: () => {} })).toThrow();
  });
});
