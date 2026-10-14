import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPlatformAdministrator, normalizeMunicipalityDraft } from '../src/lib/platform-policy.mjs';

test('municipal master and user metadata cannot grant platform access', () => {
  for (const record of [null, {}, { role: 'admin_master' }, { is_active: false }, { is_active: 'true' }]) {
    assert.throws(() => assertPlatformAdministrator(record));
  }
  assert.doesNotThrow(() => assertPlatformAdministrator({ is_active: true }));
});
test('draft payload cannot request operational activation or assign an administrator', () => {
  assert.deepEqual(normalizeMunicipalityDraft({name:'  Município  Novo ',stateCode:'ba',slug:'novo-ba',state:'active',administrator:'attacker'}),
    {name:'Município Novo',stateCode:'BA',slug:'novo-ba'});
});
test('invalid state codes, identifiers and names are rejected', () => {
  for (const input of [{name:'aa',stateCode:'BA',slug:'x'}, {name:'Teste',stateCode:'XX',slug:'x'}, {name:'Teste',stateCode:'BA',slug:'../x'}]) {
    assert.throws(() => normalizeMunicipalityDraft(input));
  }
});
