if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const port = process.env.PORT || 8080;
const mongoose = require("mongoose");
app.set("trust proxy", 1);
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");

const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "public")));

const dbUrl = process.env.ATLASDB_URL || process.env.MONGODB_URI;
const sessionSecret = process.env.SECRET || "wanderlust-dev-secret";

if (!dbUrl) {
  console.error(
    "MongoDB connection string is missing. Add ATLASDB_URL or MONGODB_URI in Render environment variables.",
  );
  process.exit(1);
}

if (!/^mongodb(\+srv)?:\/\//i.test(dbUrl)) {
  console.error(
    "Invalid MongoDB URL format. Use the connection string copied from MongoDB Atlas > Connect > Drivers.",
  );
  process.exit(1);
}

const safeDbUrl = dbUrl.replace(
  /\/\/([^:]+):([^@]+)@/,
  "//[username]:[password]@",
);

async function startServer() {
  try {
    await mongoose.connect(dbUrl, {
      serverSelectionTimeoutMS: 15000,
    });

    console.log("Connected to MongoDB successfully.");

    app.listen(port, () => {
      console.log(`Server is running on port: ${port}`);
    });
  } catch (error) {
    console.error(
      "MongoDB connection failed. Ensure the Atlas cluster exists and the connection string is correct.",
    );
    console.error(`Connection target: ${safeDbUrl}`);
    console.error(error.message);
    process.exit(1);
  }
}

startServer();

const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto: {
    secret: sessionSecret,
  },
  touchAfter: 24 * 3600,
});

store.on("error", (err) => {
  console.log("Error in MONGO SESSION STORE", err);
});

const sessionOptions = {
  store,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  },
};

app.use(session(sessionOptions));
app.use(flash());

//Using Passport Tool
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

//Here we use listings and reviews routes
app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);

//Redirect Root to listings
app.get("/", (req, res) => {
  res.redirect("/listings");
});

//Middlewares
app.use((req, res, next) => {
  next(new ExpressError(404, "Page Not Found"));
});

app.use((err, req, res, next) => {
  let { statusCode, message } = err;
  res.render("error.ejs", { message });
  // res.status(statusCode).send(message);
});
