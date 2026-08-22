# Java + Maven 参考项目（Tier A）

最小 Java/Maven 项目结构，展示 Harness 接入方式。

## 接入步骤

```bash
npx harness setup --preset single --tier lite --name java-example   # 或用 rails/单层 preset
npx harness doctor
npx harness verify unit --task <TASK-ID>   # 运行 mvn -q test
```

## 配置要点

- `harness.config.mjs`：`layers.main` → `src/main/java`、`layers.test` → `src/test/java`；`evidence.verifiers.unit` → `mvn -q test`
- `App.java` + JUnit `AppTest.java` 构成最小闭环

## 运行（需 JDK 17 + Maven）

```bash
mvn test
```
