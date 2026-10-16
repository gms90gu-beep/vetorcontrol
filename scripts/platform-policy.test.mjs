import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPlatformAdministrator, normalizeMunicipalityDraft, normalizeMunicipalAdministrator } from '../src/lib/platform-policy.mjs';

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

test('municipal Admin Master registration normalizes its email and municipality id', () => {
  assert.deepEqual(normalizeMunicipalAdministrator({
    municipalityId: '91FE865E-0398-479E-A8A2-F5631BBD8E58',
    email: '  Admin@Prefeitura.BA.GOV.BR ',
  }), {
    municipalityId: '91fe865e-0398-479e-a8a2-f5631bbd8e58',
    email: 'admin@prefeitura.ba.gov.br',
  });
});
test('municipal Admin Master registration rejects invalid identifiers and emails', () => {
  assert.throws(() => normalizeMunicipalAdministrator({
    municipalityId: 'not-a-uuid', email: 'admin@example.org',
  }), /município válido/);
  assert.throws(() => normalizeMunicipalAdministrator({
    municipalityId: '91fe865e-0398-479e-a8a2-f5631bbd8e58', email: 'email-inválido',
  }), /e-mail válido/);
});
