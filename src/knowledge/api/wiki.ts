import type * as lark from '@larksuiteoapi/node-sdk';

export class WikiApi {
  constructor(private client: lark.Client) {}

  async createNode(spaceId: string, objType: string, parentToken: string, title: string) {
    const body: Record<string, string> = {
      obj_type: objType,
      node_type: 'origin',
      title,
    };
    if (parentToken) body.parent_node_token = parentToken;

    const resp = await this.client.wiki.v2.spaceNode.create({
      path: { space_id: spaceId },
      data: body as any,
    });
    if (resp.code !== 0) throw new Error(`Wiki createNode failed: ${resp.msg}`);
    return resp.data!.node!;
  }

  async getNode(token: string, objType = 'wiki') {
    const resp = await (this.client.wiki.v2.spaceNode as any).get({
      params: { token, obj_type: objType },
    });
    if (resp.code !== 0) throw new Error(`Wiki getNode failed: ${resp.msg}`);
    return resp.data!.node!;
  }

  async listChildNodes(spaceId: string, parentToken?: string, pageSize = 50) {
    const params: Record<string, unknown> = { page_size: pageSize };
    if (parentToken) params.parent_node_token = parentToken;

    const resp = await (this.client.wiki.v2.spaceNode as any).listWithPage({
      path: { space_id: spaceId },
      params,
    });
    if (resp.code !== 0) throw new Error(`Wiki listChildNodes failed: ${resp.msg}`);
    return resp.data!;
  }

  async deleteNode(spaceId: string, nodeToken: string) {
    const resp = await (this.client.wiki.v2.spaceNode as any).delete({
      path: { space_id: spaceId, node_token: nodeToken },
    });
    if (resp.code !== 0) throw new Error(`Wiki deleteNode failed: ${resp.msg}`);
  }

  async moveNode(spaceId: string, nodeToken: string, targetParentToken: string, targetSpaceId?: string) {
    const data: Record<string, string> = { target_parent_token: targetParentToken };
    if (targetSpaceId) data.target_space_id = targetSpaceId;

    const resp = await this.client.wiki.v2.spaceNode.move({
      path: { space_id: spaceId, node_token: nodeToken },
      data,
    });
    if (resp.code !== 0) throw new Error(`Wiki moveNode failed: ${resp.msg}`);
    return resp.data!.node!;
  }
}
