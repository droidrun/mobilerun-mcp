import tsParser from '@typescript-eslint/parser';

const message = 'Import from the defining module; re-exports are only allowed in package entry files.';

export default [
    {
        ignores: ['node_modules/**', 'dist/**'],
    },
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: { parser: tsParser },
        linterOptions: { noInlineConfig: true },
        rules: {
            'no-restricted-syntax': [
                'error',
                { selector: 'ExportAllDeclaration', message },
                { selector: 'ExportNamedDeclaration[source]', message },
            ],
        },
    },
    {
        // The tools workspace exposes this file through main and types.
        files: ['packages/tools/src/index.ts'],
        rules: { 'no-restricted-syntax': 'off' },
    },
];
