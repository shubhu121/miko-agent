// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MikoComputerUseHelper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "miko-computer-use-helper", targets: ["MikoComputerUseHelper"]),
    ],
    dependencies: [
        .package(url: "https://github.com/trycua/cua.git", revision: "d38bfbfb6b1d4296903477f517b1a0fa54af497b"),
        .package(url: "https://github.com/modelcontextprotocol/swift-sdk.git", from: "0.9.0"),
    ],
    targets: [
        .executableTarget(
            name: "MikoComputerUseHelper",
            dependencies: [
                .product(name: "CuaDriverCore", package: "cua"),
                .product(name: "CuaDriverServer", package: "cua"),
                .product(name: "MCP", package: "swift-sdk"),
            ]
        ),
    ]
)
