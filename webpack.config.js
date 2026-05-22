const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: {
    capacityWidget: "./src/capacityWidget.tsx",
    capacityConfig: "./src/capacityConfig.tsx"
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "dist"),
    library: { type: "window" }
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"]
  },
  module: {
    rules: [
      { test: /\.tsx?$/, loader: "ts-loader" },
      { test: /\.s?css$/, use: ["style-loader", "css-loader", "sass-loader"] },
      { test: /\.woff$/, type: "asset/inline" }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "src/capacityWidget.html", to: "capacityWidget.html" },
        { from: "src/capacityConfig.html", to: "capacityConfig.html" }
      ]
    })
  ]
};
