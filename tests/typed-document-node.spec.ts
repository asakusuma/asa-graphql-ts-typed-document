import { Types } from '@graphql-codegen/plugin-helpers';
import { buildSchema, parse } from 'graphql';
import { plugin } from '../src';
import * as ts from 'typescript';

function findAncestor(node: ts.Node, visitor: (n: ts.Node) => boolean) {
  if (visitor(node)) {
    return true;
  }
  let found = false;
  node.forEachChild((n) => {
    if (!found) {
      found = findAncestor(n, visitor);
    }
  });
  return found;
}


describe('TypedDocumentNode', () => {
  it('Should not output imports when there are no operations at all', async () => {
    const result = (await plugin(null as any, [], {})) as Types.ComplexPluginOutput;
    expect(result.content).toBe('');
    expect(result.prepend.length).toBe(0);
  });

  it('Should not output object literal', async () => {
    const schema = buildSchema(/* GraphQL */ `
      schema {
        query: Query
      }

      type Query {
        jobs: [Job!]!
      }

      type Job {
        id: ID!
        recruiterName: String!
        title: String!
      }
    `);

    const ast = parse(/* GraphQL */ `
      query GetJobs {
        jobs {
          recruiterName
        }
      }
    `);

    const res = (await plugin(
      schema,
      [{ location: '', document: ast }],
      {},
      { outputFile: '' }
    )) as Types.ComplexPluginOutput;

    const node = ts.createSourceFile(
      'plugin-output.ts',
      res.content,
      ts.ScriptTarget.Latest
    );
    expect(findAncestor(node, (n) => ts.SyntaxKind[n.kind] === 'ObjectLiteralExpression')).toBeFalsy();
  });

  it('Should output multiple types for multiple queries', async () => {
    const schema = buildSchema(/* GraphQL */ `
      schema {
        query: Query
      }

      type Query {
        jobs: [Job!]!
      }

      type Job {
        id: ID!
        recruiterName: String!
        title: String!
      }
    `);

    const ast1 = parse(/* GraphQL */ `
      query GetJobs {
        jobs {
          title
        }
      }
    `);

    const ast2 = parse(/* GraphQL */ `
      query GetJobRecruiters {
        jobs {
          recruiterName
        }
      }
    `);

    const res = (await plugin(
      schema,
      [{ location: '', document: ast1 }, { location: '', document: ast2 }],
      {},
      { outputFile: '' }
    )) as Types.ComplexPluginOutput;

    const node = ts.createSourceFile(
      'plugin-output.ts',
      res.content,
      ts.ScriptTarget.Latest
    );
    expect(findAncestor(node, (n) => ts.SyntaxKind[n.kind] === 'ObjectLiteralExpression')).toBeFalsy();
    const typeDefinitions = node.getChildAt(0).getChildren().filter((child: ts.TypeAliasDeclaration) => {
      if (ts.SyntaxKind[child.kind] === 'TypeAliasDeclaration') {
        return true;
      }
      return false;
    }) as ts.TypeAliasDeclaration[];
    expect(typeDefinitions.length).toBe(2);
    expect(typeDefinitions[0].name.escapedText).toBe('GetJobsDocument');
    expect(typeDefinitions[1].name.escapedText).toBe('GetJobRecruitersDocument');
  });
});
