var path = require("path");
var webpack = require("webpack");

module.exports = {
  entry: {
    client: "./src/client.ts"
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          "ts-loader"
        ]
      },
    ]
  },
  resolve: {
    modules: ["node_modules"],
    extensions: [".ts", ".js", ".json", "jsx"]
  },
  plugins: [
    new webpack.ProvidePlugin({
      $: "jquery",
      jQuery: "jquery",
      "window.jQuery": "jquery"
    })
  ],
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "./html/js"),
    libraryTarget: "var",
    library: "bundle"
  }
};