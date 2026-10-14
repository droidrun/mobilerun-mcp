import tsParser from '@typescript-eslint/parser';

const message = 'Import from the defining module; re-exports are only allowed in package entry files.';

const noImportReexport = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { reexport: 'Import from the defining module; re-exports are only allowed in package entry files.' },
  },
  create(context) {
    const isImported = (node, name) => {
      for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
        const variable = scope.set.get(name);
        if (variable) return variable.defs.some((def) => def.type === 'ImportBinding');
      }
      return false;
    };
    return {
      ExportNamedDeclaration(node) {
        if (node.source || node.declaration) return;
        for (const spec of node.specifiers) {
          if (spec.local.type === 'Identifier' && isImported(node, spec.local.name)) context.report({ node: spec, messageId: 'reexport' });
        }
      },
      ExportDefaultDeclaration(node) {
        if (node.declaration.type === 'Identifier' && isImported(node, node.declaration.name)) context.report({ node, messageId: 'reexport' });
      },
    };
  },
};

export default [
    {
        ignores: ['node_modules/**', 'dist/**'],
    },
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: { parser: tsParser },
        linterOptions: { noInlineConfig: true },
        plugins: { local: { rules: { 'no-import-reexport': noImportReexport } } },
        rules: {
            'local/no-import-reexport': 'error',
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
        rules: { 'no-restricted-syntax': 'off', 'local/no-import-reexport': 'off' },
    },
];
