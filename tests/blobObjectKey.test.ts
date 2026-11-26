import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blobObjectKey} from '../blobObjectKey';

test('bucket-prefixed VM paths and raw object keys resolve to the same object', () => {
  const key='vm/cme/1795680042876_conference.jpg';
  assert.equal(blobObjectKey('/gha-files-vm/'+key,'gha-files-vm'),key);
  assert.equal(blobObjectKey('gha-files-vm/'+key,'gha-files-vm'),key);
  assert.equal(blobObjectKey(key,'gha-files-vm'),key);
  assert.equal(blobObjectKey('/gha-files/qa/photo.jpg','gha-files'),'qa/photo.jpg');
  assert.equal(blobObjectKey('/gha-files-vm-other/photo.jpg','gha-files-vm'),'gha-files-vm-other/photo.jpg');
});
