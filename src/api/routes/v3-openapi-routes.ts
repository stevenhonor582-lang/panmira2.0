/**
 * R49-B Step 6 - GET /api/v3/openapi.json
 *
 * 设计: 手维护 OpenAPI 3.0 spec(覆盖 R49-B v3 路由)
 */
import type * as http from 'node:http';
import { withErrorBoundary, sendOk } from '../middleware/unified-error.js';

const SPEC = {
  "openapi": "3.0.3",
  "info": {
    "title": "Panmira API (R49-B)",
    "version": "1.0.0-r49-b",
    "description": "R49-B 统一契约版本。所有响应使用 envelope: { success, data?, error?, meta: { traceId, version, timestamp } }。v1 deprecated(2026-08-01 Sunset),v2 coexist 1 月,v3 为推荐版本。"
  },
  "servers": [
    {
      "url": "http://localhost:9100",
      "description": "Local dev"
    },
    {
      "url": "https://panmira.example.com",
      "description": "Production"
    }
  ],
  "tags": [
    {
      "name": "health",
      "description": "健康检查"
    },
    {
      "name": "employees",
      "description": "数字员工(agent instances)"
    },
    {
      "name": "agents",
      "description": "Agent templates/instances 管理"
    },
    {
      "name": "openapi",
      "description": "API 文档元数据"
    }
  ],
  "paths": {
    "/api/v3/health": {
      "get": {
        "tags": [
          "health"
        ],
        "summary": "统一健康检查(DB/Redis/Memory/MCP/CC-SDK)",
        "description": "无需 auth,豁免 rate limit。返回 status: ok|degraded + 5 项依赖检查",
        "security": [],
        "responses": {
          "200": {
            "$ref": "#/components/responses/HealthResponse"
          }
        }
      }
    },
    "/api/v3/employees": {
      "get": {
        "tags": [
          "employees"
        ],
        "summary": "列出当前 tenant 的 agent instances(R49-B 统一列表格式)",
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200,
              "default": 50
            }
          }
        ],
        "responses": {
          "200": {
            "$ref": "#/components/responses/PaginatedAgentInstances"
          },
          "401": {
            "$ref": "#/components/responses/Unauthorized"
          },
          "403": {
            "$ref": "#/components/responses/Forbidden"
          }
        }
      }
    },
    "/api/v3/agents": {
      "get": {
        "tags": [
          "agents"
        ],
        "summary": "列出 agent templates(管理员)",
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 200,
              "default": 50
            }
          }
        ],
        "responses": {
          "200": {
            "$ref": "#/components/responses/PaginatedAgentTemplates"
          },
          "401": {
            "$ref": "#/components/responses/Unauthorized"
          },
          "403": {
            "$ref": "#/components/responses/Forbidden"
          }
        }
      }
    },
    "/api/v3/openapi.json": {
      "get": {
        "tags": [
          "openapi"
        ],
        "summary": "OpenAPI 3.0 规范(JSON)",
        "security": [],
        "responses": {
          "200": {
            "description": "OpenAPI 文档"
          }
        }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "BearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      }
    },
    "schemas": {
      "ResponseMeta": {
        "type": "object",
        "required": [
          "traceId",
          "version",
          "timestamp"
        ],
        "properties": {
          "traceId": {
            "type": "string",
            "minLength": 32,
            "maxLength": 32
          },
          "version": {
            "type": "string",
            "enum": [
              "v1",
              "v2",
              "v3"
            ]
          },
          "timestamp": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "ApiError": {
        "type": "object",
        "required": [
          "code",
          "message"
        ],
        "properties": {
          "code": {
            "type": "string"
          },
          "message": {
            "type": "string"
          },
          "details": {
            "type": "object"
          },
          "source": {
            "type": "string"
          }
        }
      },
      "Pagination": {
        "type": "object",
        "required": [
          "total",
          "page",
          "limit"
        ],
        "properties": {
          "total": {
            "type": "integer",
            "minimum": 0
          },
          "page": {
            "type": "integer",
            "minimum": 1
          },
          "limit": {
            "type": "integer",
            "minimum": 1
          }
        }
      },
      "AgentInstance": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid"
          },
          "tenantId": {
            "type": "string",
            "format": "uuid"
          },
          "name": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": [
              "active",
              "paused",
              "deprecated"
            ]
          },
          "createdAt": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "HealthCheck": {
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "ok",
              "warn",
              "fail"
            ]
          },
          "message": {
            "type": "string"
          },
          "latencyMs": {
            "type": "integer"
          }
        }
      }
    },
    "responses": {
      "HealthResponse": {
        "description": "健康检查响应",
        "content": {
          "application/json": {
            "schema": {
              "type": "object"
            }
          }
        }
      },
      "PaginatedAgentInstances": {
        "description": "分页 agent instances 列表(R49-B 格式)",
        "content": {
          "application/json": {
            "schema": {
              "type": "object"
            }
          }
        }
      },
      "PaginatedAgentTemplates": {
        "description": "分页 agent templates 列表",
        "content": {
          "application/json": {
            "schema": {
              "type": "object"
            }
          }
        }
      },
      "Unauthorized": {
        "description": "未认证",
        "content": {
          "application/json": {
            "schema": {
              "type": "object"
            }
          }
        }
      },
      "Forbidden": {
        "description": "权限不足",
        "content": {
          "application/json": {
            "schema": {
              "type": "object"
            }
          }
        }
      }
    }
  }
} as const;

export async function handleV3OpenApiRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  const u = new URL(url, 'http://localhost');
  if (u.pathname !== '/api/v3/openapi.json' && u.pathname !== '/api/v3/openapi') return false;
  if (method !== 'GET') return false;

  return withErrorBoundary(req, res, 'v3', async () => {
    sendOk(res, SPEC, 'v3');
  });
}
