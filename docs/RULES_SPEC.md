# RuleQuant 规则规格

## 规则对象

每条规则包含：

- `id`
- `name`
- `category`
- `orderMode`: `L` / `D` / `custom`
- `formula`
- `normalizer`
- `target`
- `verifyMode`
- `positionPattern`
- `periodSpan`
- `enabled`
- `tags`
- `description`
- `sourceFile`
- `examples`
- `createdAt`
- `updatedAt`

## 已支持 category

- `kill_zodiac`: 杀一肖
- `kill_sum`: 杀一合
- `kill_tail`: 杀一尾
- `kill_head`: 杀一头
- `kill_element`: 杀一行 / 杀五行
- `kill_segment`: 杀一段
- `seven_tail`: 七尾
- `eight_zodiac`: 八肖
- `eight_zodiac_two_period`: 八肖管两期
- `kill_three_as_nine`: 杀三肖 / 九肖
- `custom_set`: 自定义集合规则占位

## 公式变量

位置变量：

- `平1` 到 `平7`
- `落1` 到 `落7`
- `L1` 到 `L7`
- `D1` 到 `D7`
- `特码`、`特号`、`特`、`杀码`

属性函数：

- `头(x)`
- `尾(x)`
- `合(x)`
- `合尾(x)`
- `段(x)`
- `波(x)` / `波色(x)` / `波色值(x)`
- `行(x)` / `五行(x)` / `五行值(x)`
- `码(x)` / `号码(x)`

特殊变量：

- `特码头`、`特码尾`、`特码合`、`特码合尾`
- `特码段`、`特码波`、`特码波色值`
- `特码行`、`特码五行值`
- `总数`、`总数尾`、`总数合`
- `期数`、`期数尾`、`期尾`、`期合`、`期合尾`

## 验证逻辑

默认使用第 N 期计算，第 N+1 期的特码属性验证。八肖管两期使用第 N+1、N+2 两期验证。

所有明细都会保留：

- 当前期号
- L序 / D序
- 公式
- 变量取值
- rawResult
- normalizer 步骤
- finalResult
- 映射结果
- 下一期数据和属性
- 成功 / 失败
